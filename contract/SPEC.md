# Carbon Credit Marketplace - Specification

## Overview
A **permissionless** decentralized marketplace for trading carbon credits on Stellar/Soroban. Anyone can list, buy, and trade carbon credits without administrative control.

## Core Principles
- **No admin/owner** - Contract is fully autonomous
- **Permissionless listings** - Anyone can create a carbon credit listing
- **Permissionless purchases** - Anyone can buy listed credits
- **On-chain escrow** - Funds held securely until delivery confirmation

## Data Models

### Listing
```
listing_id: u64
seller: Address
amount: i128          // tons of CO2 offset
price_per_unit: i128  // XLM per ton
project_name: String
project_description: String
remaining_amount: i128
created_at: u64
status: ListingStatus  // Active, Completed, Cancelled
```

### Purchase (Escrow)
```
purchase_id: u64
listing_id: u64
buyer: Address
seller: Address
amount: i128
total_price: i128
status: PurchaseStatus  // Pending, Delivered, Confirmed, Cancelled
created_at: u64
```

### UserCredits
```
user: Address -> balance: i128
```

## Contract Storage

| Key | Type | Description |
|-----|------|-------------|
| `LISTINGS` | Map<u64, Listing> | All listings |
| `PURCHASES` | Map<u64, Purchase> | All purchases |
| `USER_CREDITS` | Map<Address, i128> | Per-user credit balances |
| `LISTING_COUNT` | u64 | Auto-increment listing ID |
| `PURCHASE_COUNT` | u64 | Auto-increment purchase ID |

## Permissionless Functions

### create_listing
- **Who**: Anyone
- **Params**: amount, price_per_unit, project_name, project_description
- **Action**: Creates new listing, seller receives credits in their balance
- **Storage**: `USER_CREDITS[seller] += amount`

### buy_credits
- **Who**: Anyone (except seller)
- **Params**: listing_id, amount
- **Action**: Initiates escrow purchase
- **Validation**: Listing exists, active, sufficient remaining amount
- **Storage**: Creates Purchase with Pending status

### confirm_delivery
- **Who**: Buyer only
- **Params**: purchase_id
- **Action**: Buyer confirms credits received, releases escrowed funds to seller
- **Validation**: Purchase exists, status = Delivered
- **Storage**: Updates Purchase status to Confirmed

### cancel_purchase
- **Who**: Buyer only
- **Params**: purchase_id
- **Action**: Cancels purchase, refunds buyer
- **Validation**: Purchase exists, status = Pending
- **Storage**: Updates Purchase status to Cancelled, refunds buyer credits

### Seller Actions (Part of Core Flow)

#### deliver_credits
- **Who**: Seller only (require_auth)
- **Params**: purchase_id
- **Action**: Seller confirms they've delivered, moves credits to buyer
- **Validation**: Purchase exists, status = Pending, caller is seller
- **Storage**: Transfers credits from seller to buyer, updates Purchase status to Delivered

## Read-Only Functions

### get_listing(listing_id) -> Option<Listing>
### get_purchase(purchase_id) -> Option<Purchase>
### get_user_credits(user) -> i128
### get_active_listings() -> Vec<Listing>
### get_user_purchases(user) -> Vec<Purchase>

## State Transitions

### Listing Status
```
Active -> Completed (when remaining_amount = 0)
Active -> Cancelled (seller cancels)
```

### Purchase Status
```
Pending -> Delivered (seller calls deliver_credits)
Pending -> Cancelled (buyer cancels, refunds buyer)
Delivered -> Confirmed (buyer confirms receipt, releases funds)
```

## Edge Cases
- Cannot buy own listing
- Cannot buy more than remaining amount
- Cannot confirm delivery if not buyer
- Cannot cancel after delivery confirmed
- Seller must have credits to list (no minting)

## Events
- `create_listing`: listing_id, seller, amount
- `buy_credits`: purchase_id, buyer, listing_id, amount
- `deliver_credits`: purchase_id, seller, buyer
- `confirm_delivery`: purchase_id, buyer
- `cancel_purchase`: purchase_id, buyer

## Test Cases
1. Seller creates listing → receives credits
2. Buyer buys credits → purchase created, pending
3. Seller delivers → credits transferred to buyer
4. Buyer confirms → purchase completed
5. Buyer cancels pending purchase → refund
6. Cannot buy own listing
7. Cannot buy more than available
8. Cannot confirm delivery as non-buyer
