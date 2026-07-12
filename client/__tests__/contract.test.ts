import { describe, it, expect } from "vitest";
import {
  CONTRACT_ADDRESS,
  NETWORK_PASSPHRASE,
  RPC_URL,
  HORIZON_URL,
  NETWORK,
  toScValString,
  toScValBool,
  toScValAddress,
  toScValU32,
  toScValI128,
  toScValU64,
} from "@/hooks/contract";

describe("contract constants", () => {
  it("has a valid contract address starting with C", () => {
    expect(CONTRACT_ADDRESS).toMatch(/^C[A-Z2-7]{55}$/);
  });

  it("uses testnet passphrase", () => {
    expect(NETWORK_PASSPHRASE).toContain("Test SDF Network");
  });

  it("points to soroban testnet RPC", () => {
    expect(RPC_URL).toBe("https://soroban-testnet.stellar.org");
  });

  it("points to horizon testnet", () => {
    expect(HORIZON_URL).toBe("https://horizon-testnet.stellar.org");
  });

  it("network name is TESTNET", () => {
    expect(NETWORK).toBe("TESTNET");
  });
});

describe("ScVal conversion helpers", () => {
  it("toScValString returns an xdr.ScVal", () => {
    const val = toScValString("hello");
    expect(val).toBeDefined();
    expect(val.switch().name).toBe("scvString");
  });

  it("toScValBool for true", () => {
    const val = toScValBool(true);
    expect(val).toBeDefined();
  });

  it("toScValBool for false", () => {
    const val = toScValBool(false);
    expect(val).toBeDefined();
  });

  it("toScValAddress converts a valid Stellar address", () => {
    const addr = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
    const val = toScValAddress(addr);
    expect(val).toBeDefined();
  });

  it("toScValU32 converts an integer", () => {
    const val = toScValU32(42);
    expect(val).toBeDefined();
  });

  it("toScValI128 converts a bigint", () => {
    const val = toScValI128(BigInt(1_000_000));
    expect(val).toBeDefined();
  });

  it("toScValU64 converts a bigint", () => {
    const val = toScValU64(BigInt(999));
    expect(val).toBeDefined();
  });
});
