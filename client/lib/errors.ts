/**
 * Custom error handler to map cryptic Freighter and Soroban RPC error codes 
 * to human-readable, user-friendly notification messages.
 */
export function handleBlockchainError(error: unknown): string {
  if (!error) return "An unknown error occurred.";

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Freighter extension is not installed")) {
    return "Freighter wallet extension was not found. Please install the Freighter extension in your browser.";
  }
  
  if (message.includes("User rejected") || message.includes("signing was rejected")) {
    return "Transaction signing was rejected. Please try again and approve the request in your wallet.";
  }
  
  if (message.includes("Simulation failed")) {
    return "Transaction simulation failed. The listing might have been purchased or your balance is insufficient.";
  }
  
  if (message.includes("Account not found")) {
    return "Your Stellar Testnet account was not found. Please make sure it is funded with testnet XLM using Friendbot.";
  }
  
  if (message.includes("UnreachableCodeReached") || message.includes("InvalidAction")) {
    return "Action was rejected by the smart contract rules. Please double-check your parameters.";
  }

  return message;
}
