"use client";

import { cache, cacheKey } from "@/lib/cache";

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
  "CBRF4TUZBPONARSUJN342UNUUHX75SJPMXHS5OFV6KGIRHHNYZIGJUT3";

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
  // Wrap getAccount in its own try-catch — the Stellar SDK can throw
  // complex error objects that crash the browser tab
  let account;
  try {
    account = await server.getAccount(caller);
  } catch (err) {
    throw new Error(
      `Account not found: ${caller}. Make sure the account is funded on testnet.`
    );
  }

  const contract = new Contract(CONTRACT_ADDRESS);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...params))
    .setTimeout(30)
    .build();

  let simulated;
  try {
    simulated = await server.simulateTransaction(tx);
  } catch (err) {
    throw new Error(
      `Simulation error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

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
  try {
    // Use caller, or connected wallet — never use random keys (they don't exist on testnet)
    const account = caller || (await getWalletAddress());
    if (!account) {
      throw new Error("No wallet connected. Please connect your Freighter wallet.");
    }

    // Check cache first
    const key = cacheKey(method, ...params.map(String));
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const sim = await callContract(method, params, account, false);
    if (
      rpc.Api.isSimulationSuccess(sim as rpc.Api.SimulateTransactionResponse) &&
      (sim as rpc.Api.SimulateTransactionSuccessResponse).result
    ) {
      const result = scValToNative(
        (sim as rpc.Api.SimulateTransactionSuccessResponse).result!.retval
      );
      cache.set(key, result);
      return result;
    }
    return null;
  } catch (err) {
    console.error(`readContract(${method}) failed:`, err);
    throw err;
  }
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

/** Native XLM Stellar Asset Contract on Testnet */
const NATIVE_XLM_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

/**
 * Initialize the contract with admin and token addresses.
 * Must be called once before any other write operations.
 * Uses the caller as admin and native XLM as the payment token.
 */
export async function initContract(caller: string) {
  const result = await callContract(
    "init",
    [toScValAddress(caller), toScValAddress(NATIVE_XLM_SAC)],
    caller,
    true
  );
  cache.clear();
  return result;
}

/**
 * Create a new listing for carbon credits.
 * Anyone can list credits they own.
 * Auto-initializes the contract if it hasn't been initialized yet.
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
  try {
    const result = await callContract(
      "create_listing",
      [
        toScValAddress(seller),
        toScValString(projectName),
        toScValString(projectDescription),
        toScValI128(amount),
        toScValI128(pricePerUnit),
      ],
      seller,
      true
    );
    cache.clear();
    return result;
  } catch (err) {
    // If the contract hasn't been initialized yet, initialize it and retry
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("UnreachableCodeReached") || errMsg.includes("InvalidAction")) {
      console.log("Contract not initialized. Initializing now...");
      await initContract(seller);
      // Retry after init
      const result = await callContract(
        "create_listing",
        [
          toScValAddress(seller),
          toScValString(projectName),
          toScValString(projectDescription),
          toScValI128(amount),
          toScValI128(pricePerUnit),
        ],
        seller,
        true
      );
      cache.clear();
      return result;
    }
    throw err;
  }
}

/**
 * Buy carbon credits from a listing.
 * Anyone can buy (except the seller).
 * 
 * @param buyer - Address of the buyer
 * @param creditId - ID of the credit/listing to buy from
 * @param amount - Amount of credits to buy (in tons)
 * @returns purchase_id
 */
export async function buyCredits(
  buyer: string,
  creditId: bigint,
  amount: bigint
) {
  const result = await callContract(
    "buy_credit",
    [toScValAddress(buyer), toScValU64(creditId), toScValI128(amount)],
    buyer,
    true
  );
  cache.clear();
  return result;
}

/**
 * Buyer confirms delivery of credits.
 * Releases the escrowed payment to seller and mints a fractional credit to the buyer.
 * 
 * @param buyer - Address of the buyer
 * @param purchaseId - ID of the purchase
 */
export async function confirmDelivery(
  buyer: string,
  purchaseId: bigint
) {
  const result = await callContract(
    "confirm_delivery",
    [toScValAddress(buyer), toScValU64(purchaseId)],
    buyer,
    true
  );
  cache.clear();
  return result;
}

/**
 * Cancel a pending purchase.
 * Can only be called after the time-lock deadline has passed.
 * 
 * @param caller - Address of the buyer or seller
 * @param purchaseId - ID of the purchase
 */
export async function cancelPurchase(
  caller: string,
  purchaseId: bigint
) {
  const result = await callContract(
    "cancel_purchase",
    [toScValAddress(caller), toScValU64(purchaseId)],
    caller,
    true
  );
  cache.clear();
  return result;
}

/**
 * Get credit details by ID (read-only).
 * 
 * @param creditId - ID of the credit
 * @returns Credit object or null
 */
export async function getCredit(
  creditId: bigint,
  caller?: string
) {
  return readContract(
    "get_credit",
    [toScValU64(creditId)],
    caller
  );
}

/**
 * Get purchase details by ID (read-only).
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
 * Get all active listings by iterating through all credits.
 * The contract doesn't have a bulk "get_active_listings" function,
 * so we iterate through credits and filter for listed ones.
 * 
 * @returns Array of Credit objects that are listed
 */
export async function getActiveListings(caller?: string): Promise<CreditData[]> {
  const key = cacheKey("active_listings");
  const cached = cache.get(key);
  if (cached !== undefined) return cached as CreditData[];

  const results: CreditData[] = [];
  // Iterate through credit IDs starting from 1
  // We try up to a reasonable limit and stop when we get a "not found" error
  for (let i = 1; i <= 100; i++) {
    try {
      const credit = await getCredit(BigInt(i), caller);
      if (credit && credit.is_listed) {
        results.push({ ...credit, id: BigInt(i) });
      }
    } catch {
      // Credit not found — we've reached the end
      break;
    }
  }
  cache.set(key, results);
  return results;
}

/**
 * Get all purchases by iterating through purchase IDs.
 * Filters for purchases where the user is buyer or seller.
 * 
 * @param user - Address of the user
 * @returns Array of Purchase objects
 */
export async function getUserPurchases(
  user: string,
  caller?: string
): Promise<PurchaseData[]> {
  const key = cacheKey("user_purchases", user);
  const cached = cache.get(key);
  if (cached !== undefined) return cached as PurchaseData[];

  const results: PurchaseData[] = [];
  for (let i = 1; i <= 100; i++) {
    try {
      const purchase = await getPurchase(BigInt(i), caller);
      if (purchase && (purchase.buyer === user || purchase.seller === user)) {
        results.push({ ...purchase, id: BigInt(i) });
      }
    } catch {
      // Purchase not found — we've reached the end
      break;
    }
  }
  cache.set(key, results);
  return results;
}

/**
 * Get all credits owned by a user.
 * Iterates through credits and filters by owner.
 * 
 * @param user - Address of the user  
 * @returns Array of Credit objects owned by the user
 */
export async function getUserCredits(
  user: string,
  caller?: string
): Promise<CreditData[]> {
  const key = cacheKey("user_credits", user);
  const cached = cache.get(key);
  if (cached !== undefined) return cached as CreditData[];

  const results: CreditData[] = [];
  for (let i = 1; i <= 100; i++) {
    try {
      const credit = await getCredit(BigInt(i), caller);
      if (credit && credit.owner_address === user) {
        results.push({ ...credit, id: BigInt(i) });
      }
    } catch {
      break;
    }
  }
  cache.set(key, results);
  return results;
}

// ============================================================
// Types for return data from contract
// ============================================================

export interface CreditData {
  id: bigint;
  project_name: string;
  carbon_amount: bigint;
  creator_address: string;
  owner_address: string;
  verification_status: string;
  is_listed: boolean;
  price_per_ton: bigint;
  timestamp: bigint;
}

export interface PurchaseData {
  id: bigint;
  credit_id: bigint;
  buyer: string;
  seller: string;
  amount_purchased: bigint;
  locked_funds: bigint;
  status: string;
  timestamp: bigint;
  deadline: bigint;
}

// Re-export types
export { nativeToScVal, scValToNative, Address, xdr };
