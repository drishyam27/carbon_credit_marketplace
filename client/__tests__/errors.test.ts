import { describe, it, expect } from "vitest";
import { handleBlockchainError } from "../lib/errors";

describe("handleBlockchainError", () => {
  it("should return correct message for missing Freighter wallet extension", () => {
    const err = new Error("Freighter extension is not installed or not available.");
    expect(handleBlockchainError(err)).toContain("extension was not found");
  });

  it("should return correct message for user rejecting the transaction signing request", () => {
    const err = new Error("User rejected signing");
    expect(handleBlockchainError(err)).toContain("signing was rejected");
  });

  it("should return correct message for transaction simulation failures", () => {
    const err = new Error("Simulation failed: some contract revert");
    expect(handleBlockchainError(err)).toContain("Transaction simulation failed");
  });

  it("should return correct message for unfunded or missing accounts on testnet", () => {
    const err = new Error("Account not found: GBR4...");
    expect(handleBlockchainError(err)).toContain("account was not found");
  });

  it("should fallback to the standard error message for unrecognized error types", () => {
    const err = new Error("Some random network timeout");
    expect(handleBlockchainError(err)).toBe("Some random network timeout");
  });

  it("should return default message if error is null or undefined", () => {
    expect(handleBlockchainError(null)).toBe("An unknown error occurred.");
    expect(handleBlockchainError(undefined)).toBe("An unknown error occurred.");
  });
});
