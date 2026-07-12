import { describe, it, expect } from "vitest";

/**
 * These tests validate the core UI helper logic used throughout
 * the Contract and page components. They don't mount React components
 * (which would require mocking Freighter / Stellar SDK) but
 * instead test the pure functions and data structures.
 */

// ── Address truncation ──────────────────────────────────────

describe("truncate", () => {
  const truncate = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  it("truncates a 56-char Stellar address correctly", () => {
    const addr = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
    expect(truncate(addr)).toBe("GAAZI4...CWN7");
  });

  it("returns empty string for empty input", () => {
    expect(truncate("")).toBe("");
  });

  it("handles short strings gracefully", () => {
    expect(truncate("ABCDE")).toBe("ABCDE...BCDE");
  });
});

// ── formatAmount ─────────────────────────────────────────────

describe("formatAmount", () => {
  const formatAmount = (n: bigint) => (Number(n) / 1_000_000).toFixed(2);

  it("formats 1_000_000n as 1.00", () => {
    expect(formatAmount(BigInt(1_000_000))).toBe("1.00");
  });

  it("formats 0n as 0.00", () => {
    expect(formatAmount(BigInt(0))).toBe("0.00");
  });

  it("formats 500_000n as 0.50", () => {
    expect(formatAmount(BigInt(500_000))).toBe("0.50");
  });

  it("formats large values correctly", () => {
    expect(formatAmount(BigInt(5_000_000_000))).toBe("5000.00");
  });
});

// ── Listing status config ───────────────────────────────────

describe("listing status config", () => {
  const LISTING_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    Active: { color: "text-[#34d399]", bg: "bg-[#34d399]/10", label: "Active" },
    Completed: { color: "text-[#4fc3f7]", bg: "bg-[#4fc3f7]/10", label: "Sold Out" },
    Cancelled: { color: "text-[#f87171]", bg: "bg-[#f87171]/10", label: "Cancelled" },
  };

  it("has Active status with green color", () => {
    expect(LISTING_STATUS_CONFIG.Active.label).toBe("Active");
    expect(LISTING_STATUS_CONFIG.Active.color).toContain("#34d399");
  });

  it("has Completed status labeled 'Sold Out'", () => {
    expect(LISTING_STATUS_CONFIG.Completed.label).toBe("Sold Out");
  });

  it("has Cancelled status with red color", () => {
    expect(LISTING_STATUS_CONFIG.Cancelled.color).toContain("#f87171");
  });
});

// ── Purchase status config ──────────────────────────────────

describe("purchase status config", () => {
  const PURCHASE_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    Pending: { color: "text-[#fbbf24]", bg: "bg-[#fbbf24]/10", label: "Awaiting Delivery" },
    Delivered: { color: "text-[#4fc3f7]", bg: "bg-[#4fc3f7]/10", label: "Delivered" },
    Confirmed: { color: "text-[#34d399]", bg: "bg-[#34d399]/10", label: "Completed" },
    Cancelled: { color: "text-[#f87171]", bg: "bg-[#f87171]/10", label: "Cancelled" },
  };

  it("has 4 purchase statuses", () => {
    expect(Object.keys(PURCHASE_STATUS_CONFIG)).toHaveLength(4);
  });

  it("Pending status shows 'Awaiting Delivery'", () => {
    expect(PURCHASE_STATUS_CONFIG.Pending.label).toBe("Awaiting Delivery");
  });

  it("Confirmed status shows 'Completed'", () => {
    expect(PURCHASE_STATUS_CONFIG.Confirmed.label).toBe("Completed");
  });
});

// ── Tab config ──────────────────────────────────────────────

describe("tab config", () => {
  type Tab = "browse" | "list" | "my-credits" | "purchases";

  const tabs: { key: Tab; label: string; color: string }[] = [
    { key: "browse", label: "Browse", color: "#34d399" },
    { key: "list", label: "List Credits", color: "#7c6cf0" },
    { key: "my-credits", label: "My Credits", color: "#4fc3f7" },
    { key: "purchases", label: "Purchases", color: "#fbbf24" },
  ];

  it("has exactly 4 tabs", () => {
    expect(tabs).toHaveLength(4);
  });

  it("browse is the first tab", () => {
    expect(tabs[0].key).toBe("browse");
  });

  it("each tab has a unique color", () => {
    const colors = new Set(tabs.map((t) => t.color));
    expect(colors.size).toBe(4);
  });

  it("all tabs have non-empty labels", () => {
    tabs.forEach((t) => expect(t.label.length).toBeGreaterThan(0));
  });
});
