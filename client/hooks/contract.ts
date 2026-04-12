"use client";

import {
  Contract,
  Networks,
  TransactionBuilder,
  Keypair,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  rpc,
} from "@stellar/stellar-sdk";
import {
  isConnected,
  getAddress,
  signTransaction,
  setAllowed,
  isAllowed,
  requestAccess,
} from "@stellar/freighter-api";

// ============================================================
// CONSTANTS — Update these for your contract
// ============================================================

/** Your deployed Soroban contract ID */
export const CONTRACT_ADDRESS =
  "CDJVMAX34YRCQ5JFC6SIOQOVSUY6XWEFYJOLF3SBCKU7CMI3IAP6HPWN";

/** Network passphrase (testnet by default) */
export const NETWORK_PASSPHRASE = Networks.TESTNET;

/** Soroban RPC URL */
export const RPC_URL = "https://soroban-testnet.stellar.org";

/** Horizon URL */
export const HORIZON_URL = "https://horizon-testnet.stellar.org";

/** Network name for Freighter */
export const NETWORK = "TESTNET";

// ============================================================
// RPC Server Instance
// ============================================================

const server = new rpc.Server(RPC_URL);

// ============================================================
// Wallet Helpers
// ============================================================

export async function checkConnection(): Promise<boolean> {
  const result = await isConnected();
  return result.isConnected;
}

export async function connectWallet(): Promise<string> {
  const connResult = await isConnected();
  if (!connResult.isConnected) {
    throw new Error("Freighter extension is not installed or not available.");
  }

  const allowedResult = await isAllowed();
  if (!allowedResult.isAllowed) {
    await setAllowed();
    await requestAccess();
  }

  const { address } = await getAddress();
  if (!address) {
    throw new Error("Could not retrieve wallet address from Freighter.");
  }
  return address;
}

export async function getWalletAddress(): Promise<string | null> {
  try {
    const connResult = await isConnected();
    if (!connResult.isConnected) return null;

    const allowedResult = await isAllowed();
    if (!allowedResult.isAllowed) return null;

    const { address } = await getAddress();
    return address || null;
  } catch {
    return null;
  }
}

// ============================================================
// Contract Interaction Helpers
// ============================================================

/**
 * Build, simulate, and optionally sign + submit a Soroban contract call.
 *
 * @param method   - The contract method name to invoke
 * @param params   - Array of xdr.ScVal parameters for the method
 * @param caller   - The public key (G...) of the calling account
 * @param sign     - If true, signs via Freighter and submits. If false, only simulates.
 * @returns        The result of the simulation or submission
 */
export async function callContract(
  method: string,
  params: xdr.ScVal[] = [],
  caller: string,
  sign: boolean = true
) {
  const contract = new Contract(CONTRACT_ADDRESS);
  const account = await server.getAccount(caller);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...params))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(
      `Simulation failed: ${(simulated as rpc.Api.SimulateTransactionErrorResponse).error}`
    );
  }

  if (!sign) {
    // Read-only call — just return the simulation result
    return simulated;
  }

  // Prepare the transaction with the simulation result
  const prepared = rpc.assembleTransaction(tx, simulated).build();

  // Sign with Freighter
  const { signedTxXdr } = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const txToSubmit = TransactionBuilder.fromXDR(
    signedTxXdr,
    NETWORK_PASSPHRASE
  );

  const result = await server.sendTransaction(txToSubmit);

  if (result.status === "ERROR") {
    throw new Error(`Transaction submission failed: ${result.status}`);
  }

  // Poll for confirmation
  let getResult = await server.getTransaction(result.hash);
  while (getResult.status === "NOT_FOUND") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    getResult = await server.getTransaction(result.hash);
  }

  if (getResult.status === "FAILED") {
    throw new Error("Transaction failed on chain.");
  }

  return getResult;
}

/**
 * Read-only contract call (does not require signing).
 */
export async function readContract(
  method: string,
  params: xdr.ScVal[] = [],
  caller?: string
) {
  const account =
    caller || Keypair.random().publicKey(); // Use a random keypair for read-only
  const sim = await callContract(method, params, account, false);
  if (
    rpc.Api.isSimulationSuccess(sim as rpc.Api.SimulateTransactionResponse) &&
    (sim as rpc.Api.SimulateTransactionSuccessResponse).result
  ) {
    return scValToNative(
      (sim as rpc.Api.SimulateTransactionSuccessResponse).result!.retval
    );
  }
  return null;
}

// ============================================================
// ScVal Conversion Helpers
// ============================================================

export function toScValString(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "string" });
}

export function toScValU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

export function toScValI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

export function toScValAddress(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

export function toScValBool(value: boolean): xdr.ScVal {
  return nativeToScVal(value, { type: "bool" });
}

export function toScValU64(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}

// ============================================================
// Carbon Credit Marketplace — Contract Methods
// ============================================================

/**
 * Create a new listing for carbon credits.
 * Anyone can list credits they own.
 * 
 * @param seller - Address of the seller (must match wallet)
 * @param amount - Amount of CO2 credits in tons
 * @param pricePerUnit - Price per ton in XLM (stroops)
 * @param projectName - Name of the carbon offset project
 * @param projectDescription - Description of the project
 * @returns listing_id
 */
export async function createListing(
  seller: string,
  amount: bigint,
  pricePerUnit: bigint,
  projectName: string,
  projectDescription: string
) {
  return callContract(
    "create_listing",
    [
      toScValAddress(seller),
      toScValI128(amount),
      toScValI128(pricePerUnit),
      toScValString(projectName),
      toScValString(projectDescription),
    ],
    seller,
    true
  );
}

/**
 * Buy carbon credits from a listing.
 * Anyone can buy (except the seller).
 * 
 * @param buyer - Address of the buyer
 * @param listingId - ID of the listing to buy from
 * @param amount - Amount of credits to buy
 * @returns purchase_id
 */
export async function buyCredits(
  buyer: string,
  listingId: bigint,
  amount: bigint
) {
  return callContract(
    "buy_credits",
    [toScValAddress(buyer), toScValU64(listingId), toScValI128(amount)],
    buyer,
    true
  );
}

/**
 * Seller delivers credits to buyer.
 * Called by seller after buyer initiates purchase.
 * 
 * @param seller - Address of the seller
 * @param purchaseId - ID of the purchase
 */
export async function deliverCredits(
  seller: string,
  purchaseId: bigint
) {
  return callContract(
    "deliver_credits",
    [toScValAddress(seller), toScValU64(purchaseId)],
    seller,
    true
  );
}

/**
 * Buyer confirms delivery of credits.
 * Releases the escrowed payment to seller.
 * 
 * @param buyer - Address of the buyer
 * @param purchaseId - ID of the purchase
 */
export async function confirmDelivery(
  buyer: string,
  purchaseId: bigint
) {
  return callContract(
    "confirm_delivery",
    [toScValAddress(buyer), toScValU64(purchaseId)],
    buyer,
    true
  );
}

/**
 * Buyer cancels a pending purchase.
 * Refunds the credits back to the listing.
 * 
 * @param buyer - Address of the buyer
 * @param purchaseId - ID of the purchase
 */
export async function cancelPurchase(
  buyer: string,
  purchaseId: bigint
) {
  return callContract(
    "cancel_purchase",
    [toScValAddress(buyer), toScValU64(purchaseId)],
    buyer,
    true
  );
}

/**
 * Get listing details (read-only).
 * 
 * @param listingId - ID of the listing
 * @returns Listing object or null
 */
export async function getListing(
  listingId: bigint,
  caller?: string
) {
  return readContract(
    "get_listing",
    [toScValU64(listingId)],
    caller
  );
}

/**
 * Get purchase details (read-only).
 * 
 * @param purchaseId - ID of the purchase
 * @returns Purchase object or null
 */
export async function getPurchase(
  purchaseId: bigint,
  caller?: string
) {
  return readContract(
    "get_purchase",
    [toScValU64(purchaseId)],
    caller
  );
}

/**
 * Get user's carbon credit balance (read-only).
 * 
 * @param user - Address of the user
 * @returns Credit balance as bigint
 */
export async function getUserCredits(
  user: string,
  caller?: string
) {
  return readContract(
    "get_user_credits",
    [toScValAddress(user)],
    caller
  );
}

/**
 * Get all active listings (read-only).
 * 
 * @returns Array of Listing objects
 */
export async function getActiveListings(caller?: string) {
  return readContract(
    "get_active_listings",
    [],
    caller
  );
}

/**
 * Get all purchases for a user (read-only).
 * 
 * @param user - Address of the user
 * @returns Array of Purchase objects
 */
export async function getUserPurchases(
  user: string,
  caller?: string
) {
  return readContract(
    "get_user_purchases",
    [toScValAddress(user)],
    caller
  );
}

// Re-export types
export { nativeToScVal, scValToNative, Address, xdr };
