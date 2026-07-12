# Carbon Credit Marketplace — Permissionless DApp on Stellar

[![CI — Carbon Credit Marketplace](https://github.com/drishyam27/carbon_credit_marketplace/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/drishyam27/carbon_credit_marketplace/actions/workflows/ci.yml)

A fully decentralized, permissionless Carbon Credit Marketplace built on the Stellar blockchain using Soroban smart contracts. List, buy, and trade carbon credits with automated escrow — no central authority required.

 **Live Demo:** https://carbon-credit-marketplace-sage.vercel.app/

##  Demo Video

https://github.com/user-attachments/assets/a7ccc55f-41b7-4e21-9e06-8af8d8da75da

---

##  Table of Contents

- [Project Description](#-project-description)
- [Screenshots](#-screenshots)
- [Core Features](#-core-features)
- [Smart Contract Functions](#-smart-contract-functions)
- [Smart Contract Architecture](#-smart-contract-architecture)
- [Custom Token & Contract Addresses](#-custom-token--contract-addresses)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Testing](#-testing)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Caching Strategy](#-caching-strategy)
- [Project Structure](#-project-structure)
- [Demo Walkthrough Data](#-demo-walkthrough-data)

---

## Project Description

The Carbon Credit Marketplace is a blockchain-based decentralized application (dApp) that enables the open trading of carbon credits. Unlike traditional systems, this marketplace is **completely permissionless**, meaning there are no admin gates for participation. Anyone can list a verified carbon project, and any user with a Stellar Wallet can buy fractional or total ownership of these credits.

The platform is powered by a robust **Rust Backend** utilizing the **Soroban Rust SDK**. The contract handles the intricate rules of carbon trading: automated escrow, fractional credit segmentation, verification status checks, and time-locked dispute resolution.

### Core Features

- ** Fully Permissionless:** No central authority to approve participation.
- ** Decentralized Escrow:** Funds are securely locked in the contract until the buyer confirms delivery.
- ** Fractional Trading:** Smart contracts automatically mint fractional credits for partial purchases.
- ** Custom Token Minting:** Each listing deploys a unique Soroban token (Stellar Asset). Buyers receive carbon‑offset tokens representing their fractional ownership on purchase.
- ** Dispute Resolution:** Built-in mechanisms to freeze funds and trigger arbitration.
- ** In-Memory Caching:** TTL-based caching reduces redundant RPC calls for read-only queries.
- ** Mobile Responsive:** Fully responsive UI with hamburger navigation and stacking cards on mobile.
- ** Comprehensive Testing:** 38+ frontend tests + 8 Rust contract tests (including custom token minting).
- ** CI/CD Pipeline:** Automated testing via GitHub Actions on every push.

---

## Screenshots

### Application UI
<img width="1920" height="1080" alt="Screenshot (300)" src="https://github.com/user-attachments/assets/1f6d9c64-0aff-4224-9a35-5de589d717d8" />


### Contract Interaction
<img width="1920" height="1080" alt="Screenshot (305)" src="https://github.com/user-attachments/assets/d603b17b-f4e5-4de5-aa2c-ca7e72717a40" />

###  Mobile Responsive View

<img width="717" height="1600" alt="WhatsApp Image 2026-04-29 at 8 57 19 PM" src="https://github.com/user-attachments/assets/3e7f7a50-78f0-4811-9820-bba4dae068ec" />

---

## Smart Contract Functions

| Function | Description |
|----------|-------------|
| `create_listing` | Create a new carbon credit listing |
| `buy_credits` | Purchase credits from a listing — locks funds in escrow **and mints custom carbon‑offset tokens to buyer** |
| `deliver_credits` | Seller marks credits as delivered |
| `confirm_delivery` | Buyer confirms receipt, releasing escrowed payment to seller |
| `cancel_purchase` | Buyer cancels a pending purchase (refunds to listing) |
| `get_listing` | Get listing details by ID (read-only) |
| `get_purchase` | Get purchase details by ID (read-only) |
| `get_user_credits` | Get a user's carbon credit balance (read-only) |
| `get_active_listings` | Get all active listings (read-only) |
| `get_user_purchases` | Get all purchases for a user (read-only) |
| `get_carbon_token` | Get the global custom carbon‑offset token address (read-only) |

---

##  Smart Contract Architecture

The Soroban smart contract is written in Rust and manages the full lifecycle of carbon credit trading:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Seller    │────▶│ create_listing│────▶│  Active Listing │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                                             ┌────▼────┐
                                             │ Listing │
                                             └────┬────┘
┌─────────────┐     ┌────▼─────────┐              ▼
│   Buyer     │────▶│  buy_credits │────▶ Escrow (Pending)
└─────────────┘     └──────────────┘    + Mint Carbon Tokens
                                             │         │
                                             ▼         ▼
                                    confirm_delivery  cancel_purchase
                                             │         │
                                             ▼         ▼
                                      Payment Released  Refund
```

### Key Design Decisions
- **No admin gates** — anyone can list and buy credits
- **Escrow-based** — funds are locked until delivery is confirmed
- **Custom Token** — the marketplace utilizes a single, global custom Stellar Asset to represent verified carbon offsets; buyers receive fractional carbon‑offset tokens on purchase
- **Fractional support** — partial purchases are supported via remaining_amount tracking
- **Cache invalidation** — all write operations clear the frontend cache

---

## Custom Token & Contract Addresses

> Paste your deployed addresses here after manual deployment to Stellar Testnet.

| Item | Address |
|------|---------|
| **Marketplace Contract** | `CBRF4TUZBPONARSUJN342UNUUHX75SJPMXHS5OFV6KGIRHHNYZIGJUT3` |
| **Payment Token (XLM/USDC)** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **Global Carbon Token** | `CA3OQWYI2N5S7ZZ5M7WYYTBYRZZCBY5X7AIPQYW2XYU6GZYD4HMMX2O4` |

> **Tip:** After deployment, call `get_carbon_token()` on-chain to retrieve the global token address.

---

## Tech Stack

| Layer | Technology |
|-------|-----------| 
| **Smart Contract** | Rust + Soroban SDK |
| **Frontend** | Next.js 16, React 19, TypeScript |
| **Styling** | Tailwind CSS 4 |
| **Wallet** | Freighter (Stellar) |
| **Blockchain** | Stellar Testnet (Soroban) |
| **Testing** | Vitest (frontend), Cargo test (contract) |
| **CI/CD** | GitHub Actions |
| **Deployment** | Vercel |

---

##  Getting Started

### Prerequisites

- **Rust** — [rustup.rs](https://rustup.rs/) (add `wasm32-unknown-unknown` target)
- **Soroban CLI** — `cargo install --locked soroban-cli`
- **Node.js** — v18 or higher
- **Freighter Wallet** — [Chrome Extension](https://www.freighter.app/)

### Clone & Install

```bash
git clone https://github.com/drishyam27/carbon_credit_marketplace.git
cd carbon_credit_marketplace/client
npm install
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the marketplace.

### Deploy Contract (Stellar Testnet)

```bash
cd contract/contracts/contract
soroban config identity generate alice
soroban config identity fund alice --network testnet
soroban contract build
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/contract.wasm \
  --source alice \
  --network testnet
```

---

## Testing

### Frontend Tests (Vitest)

```bash
cd client
npm test
```

This runs the Vitest test suite with **20+ tests** covering:

- **Cache utility** — TTL expiry, get/set, key building, clear/delete
- **Contract helpers** — Constants validation, ScVal conversion functions (string, bool, address, u32, i128, u64)
- **Component logic** — Address truncation, amount formatting, status configs, tab navigation

### Smart Contract Tests (Rust)

```bash
cd contract
cargo test
```

This runs the Soroban tests covering:

- Listing creation & validation
- Credit purchasing & escrow logic
- Delivery confirmation & payment release
- Purchase cancellation & refund
- Edge cases & error conditions
- **Custom token minting on buy** — verifies tokens are minted to the buyer's wallet
- **Multiple buyer token distribution** — verifies independent balances per buyer
- **Carbon token address retrieval** — verifies `get_carbon_token` returns valid addresses

### Test Output Screenshot

<img width="1178" height="197" alt="Screenshot 2026-04-29 002845" src="https://github.com/user-attachments/assets/e954d7f6-07f8-4e14-a5c4-0223df05c25b" />

---

## CI/CD Pipeline

This project uses **GitHub Actions** to run automated tests on every push:

| Job | What it does |
|-----|-------------|
| `contract-tests` | Installs Rust + `wasm32-unknown-unknown` target, runs `cargo test` |
| `frontend-tests` | Installs Node.js 20, runs `npm ci` + `npm test` (Vitest) |

The pipeline is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Caching Strategy

The application implements an **in-memory TTL cache** (`lib/cache.ts`) to minimize redundant Soroban RPC calls:

| Setting | Value |
|---------|-------|
| **Default TTL** | 30 seconds |
| **Cache Scope** | All read-only contract calls |
| **Invalidation** | Full cache clear on any write operation |

### How It Works

1. **Read calls** (`getListing`, `getActiveListings`, `getUserCredits`, etc.) check the cache first
2. On **cache miss**, the RPC result is fetched and stored with a 30s TTL
3. On **any write** (`createListing`, `buyCredits`, `deliverCredits`, etc.), the entire cache is cleared
4. **Expired entries** are automatically evicted on the next read

---

## Project Structure

```
carbon_credit_marketplace/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI/CD pipeline
├── client/                     # Next.js frontend
│   ├── __tests__/              # Vitest test suites
│   │   ├── cache.test.ts       # Cache utility tests
│   │   ├── contract.test.ts    # Contract helper tests
│   │   └── components.test.ts  # Component logic tests
│   ├── app/                    # Next.js app router
│   │   ├── layout.tsx          # Root layout + SEO
│   │   ├── page.tsx            # Home page
│   │   └── globals.css         # Global styles
│   ├── components/             # React components
│   │   ├── Contract.tsx        # Main marketplace UI (mobile-responsive)
│   │   ├── Navbar.tsx          # Navigation bar (mobile hamburger menu)
│   │   └── ui/                 # Reusable UI primitives
│   ├── hooks/
│   │   └── contract.ts         # Soroban contract integration
│   ├── lib/
│   │   ├── cache.ts            # In-memory TTL cache
│   │   └── utils.ts            # Utility functions
│   ├── vitest.config.ts        # Test configuration
│   └── package.json
├── contract/                   # Soroban smart contract (Rust)
│   └── contracts/contract/
│       └── src/
│           ├── lib.rs          # Contract implementation (custom token minting)
│           └── test.rs         # Contract tests (8 tests incl. token mint tests)
└── README.md
```

---

## Demo Walkthrough Data

If you are evaluating this project or recording a demo, use the following mock data:

### 1. Creating a Listing (Seller)
* **Project Name:** `Amazon Reforestation Initiative - Phase II`
* **Description:** `A Gold Standard certified reforestation and direct air capture project in the Brazilian Amazon. Restores degraded land and employs local indigenous communities.`
* **Amount (Total Supply):** `5000` (metric tons)
* **Price Per Ton:** `25` (testnet XLM/tokens)

### 2. Buying Credits (Buyer)
* **Amount to Buy:** `100` (tons)
* **Total Escrow Lockup:** `2500` tokens (automatically locked in escrow)
* **Carbon Tokens Minted:** `100` custom carbon-offset tokens sent to buyer wallet

### 3. Delivery Confirmation
* Seller clicks **"Deliver Credits"** after off-chain verification
* Buyer clicks **"Confirm Receipt"** to release escrowed payment

---

## License

MIT
