import { describe, it, expect } from "vitest";
import { truncateAddress, formatStellarExplorerLink } from "../lib/utils";

describe("truncateAddress", () => {
  it("should truncate long Stellar addresses correctly", () => {
    const address = "GBR46XMARKETPLACE75SJPMXHS5OFV6KGIRHHNYZIGJUT3";
    expect(truncateAddress(address)).toBe("GBR4...JUT3");
    expect(truncateAddress(address, 6)).toBe("GBR46X...IGJUT3");
  });

  it("should return the original address if it is too short to truncate", () => {
    expect(truncateAddress("ABC")).toBe("ABC");
    expect(truncateAddress("")).toBe("");
  });
});

describe("formatStellarExplorerLink", () => {
  it("should format transaction detail URL on StellarExpert testnet", () => {
    const hash = "123456abcdef";
    expect(formatStellarExplorerLink(hash, "tx")).toBe(
      "https://stellar.expert/explorer/testnet/tx/123456abcdef"
    );
  });

  it("should format account detail URL on StellarExpert testnet", () => {
    const address = "GBR46X";
    expect(formatStellarExplorerLink(address, "account")).toBe(
      "https://stellar.expert/explorer/testnet/account/GBR46X"
    );
  });
});
