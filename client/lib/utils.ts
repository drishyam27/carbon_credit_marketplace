import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Truncates a Stellar wallet address or transaction hash to a human-readable format.
 * Example: GBR46X...4TUZ
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (!address || address.length < chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Generates a URL linking to a transaction or account detail page on StellarExpert Testnet.
 */
export function formatStellarExplorerLink(
  identifier: string,
  type: "tx" | "account"
): string {
  return `https://stellar.expert/explorer/testnet/${type}/${identifier}`;
}

