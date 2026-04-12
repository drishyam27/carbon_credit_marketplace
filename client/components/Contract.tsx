"use client";

import { useState, useCallback, useEffect } from "react";
import {
  createListing,
  buyCredits,
  deliverCredits,
  confirmDelivery,
  cancelPurchase,
  getListing,
  getPurchase,
  getUserCredits,
  getActiveListings,
  getUserPurchases,
  CONTRACT_ADDRESS,
} from "@/hooks/contract";
import { AnimatedCard } from "@/components/ui/animated-card";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────

interface Listing {
  seller: string;
  amount: bigint;
  price_per_unit: bigint;
  project_name: string;
  project_description: string;
  remaining_amount: bigint;
  created_at: bigint;
  status: { Active?: null; Completed?: null; Cancelled?: null };
}

interface Purchase {
  listing_id: bigint;
  buyer: string;
  seller: string;
  amount: bigint;
  total_price: bigint;
  status: { Pending?: null; Delivered?: null; Confirmed?: null; Cancelled?: null };
  created_at: bigint;
}

type Tab = "browse" | "list" | "my-credits" | "purchases";

// ── Icons ────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ── Styled Input ─────────────────────────────────────────────

function Input({
  label,
  suffix,
  ...props
}: { label: string; suffix?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium uppercase tracking-wider text-white/30">
        {label}
      </label>
      <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-px transition-all focus-within:border-[#34d399]/30 focus-within:shadow-[0_0_20px_rgba(52,211,153,0.08)]">
        <div className="flex items-center rounded-[11px] bg-transparent">
          <input
            {...props}
            className="flex-1 rounded-[11px] bg-transparent px-4 py-3 font-mono text-sm text-white/90 placeholder:text-white/15 outline-none"
          />
          {suffix && <span className="pr-4 text-sm text-white/30">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Status Config ────────────────────────────────────────────

const LISTING_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  Active: { color: "text-[#34d399]", bg: "bg-[#34d399]/10", label: "Active" },
  Completed: { color: "text-[#4fc3f7]", bg: "bg-[#4fc3f7]/10", label: "Sold Out" },
  Cancelled: { color: "text-[#f87171]", bg: "bg-[#f87171]/10", label: "Cancelled" },
};

const PURCHASE_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  Pending: { color: "text-[#fbbf24]", bg: "bg-[#fbbf24]/10", label: "Awaiting Delivery" },
  Delivered: { color: "text-[#4fc3f7]", bg: "bg-[#4fc3f7]/10", label: "Delivered" },
  Confirmed: { color: "text-[#34d399]", bg: "bg-[#34d399]/10", label: "Completed" },
  Cancelled: { color: "text-[#f87171]", bg: "bg-[#f87171]/10", label: "Cancelled" },
};

// ── Main Component ───────────────────────────────────────────

interface ContractUIProps {
  walletAddress: string | null;
  onConnect: () => void;
  isConnecting: boolean;
}

export default function ContractUI({ walletAddress, onConnect, isConnecting }: ContractUIProps) {
  const [activeTab, setActiveTab] = useState<Tab>("browse");
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Browse listings
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoadingListings, setIsLoadingListings] = useState(false);
  const [buyAmount, setBuyAmount] = useState<Record<string, string>>({});

  // Create listing
  const [listAmount, setListAmount] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // My credits
  const [myCredits, setMyCredits] = useState<bigint>(BigInt(0));
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);

  // My purchases
  const [myPurchases, setMyPurchases] = useState<Purchase[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);

  const truncate = (addr: string) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  const formatAmount = (n: bigint) => {
    return (Number(n) / 1_000_000).toFixed(2); // Assuming 6 decimal places for display
  };

  const loadListings = useCallback(async () => {
    setIsLoadingListings(true);
    try {
      const result = await getActiveListings();
      if (Array.isArray(result)) {
        setListings(result as Listing[]);
      }
    } catch (err) {
      console.error("Failed to load listings:", err);
    } finally {
      setIsLoadingListings(false);
    }
  }, []);

  const loadMyCredits = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingCredits(true);
    try {
      const result = await getUserCredits(walletAddress);
      setMyCredits(typeof result === 'bigint' ? result : BigInt(0));
    } catch (err) {
      console.error("Failed to load credits:", err);
    } finally {
      setIsLoadingCredits(false);
    }
  }, [walletAddress]);

  const loadMyPurchases = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingPurchases(true);
    try {
      const result = await getUserPurchases(walletAddress);
      if (Array.isArray(result)) {
        setMyPurchases(result as Purchase[]);
      }
    } catch (err) {
      console.error("Failed to load purchases:", err);
    } finally {
      setIsLoadingPurchases(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (activeTab === "browse") {
      loadListings();
    } else if (activeTab === "my-credits") {
      loadMyCredits();
    } else if (activeTab === "purchases") {
      loadMyPurchases();
    }
  }, [activeTab, loadListings, loadMyCredits, loadMyPurchases]);

  const handleCreateListing = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    if (!listAmount || !listPrice || !projectName.trim()) {
      return setError("Fill in all required fields");
    }
    setError(null);
    setIsCreating(true);
    setTxStatus("Awaiting signature...");
    try {
      await createListing(
        walletAddress,
        BigInt(parseFloat(listAmount) * 1_000_000), // Convert to stroops-like units
        BigInt(parseFloat(listPrice) * 1_000_000),
        projectName.trim(),
        projectDesc.trim()
      );
      setTxStatus("Listing created! Credits added to your balance.");
      setListAmount("");
      setListPrice("");
      setProjectName("");
      setProjectDesc("");
      loadListings();
      loadMyCredits();
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    } finally {
      setIsCreating(false);
    }
  }, [walletAddress, listAmount, listPrice, projectName, projectDesc, loadListings, loadMyCredits]);

  const handleBuyCredits = useCallback(async (listingId: string) => {
    if (!walletAddress) return setError("Connect wallet first");
    const amount = buyAmount[listingId];
    if (!amount || parseFloat(amount) <= 0) {
      return setError("Enter a valid amount");
    }
    setError(null);
    setTxStatus("Awaiting signature...");
    try {
      await buyCredits(
        walletAddress,
        BigInt(listingId),
        BigInt(parseFloat(amount) * 1_000_000)
      );
      setTxStatus("Purchase initiated! Waiting for delivery.");
      setBuyAmount(prev => ({ ...prev, [listingId]: "" }));
      loadListings();
      loadMyPurchases();
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    }
  }, [walletAddress, buyAmount, loadListings, loadMyPurchases]);

  const handleDeliverCredits = useCallback(async (purchaseId: bigint) => {
    if (!walletAddress) return setError("Connect wallet first");
    setError(null);
    setTxStatus("Awaiting signature...");
    try {
      await deliverCredits(walletAddress, purchaseId);
      setTxStatus("Credits delivered! Waiting for buyer confirmation.");
      loadMyPurchases();
      loadMyCredits();
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    }
  }, [walletAddress, loadMyPurchases, loadMyCredits]);

  const handleConfirmDelivery = useCallback(async (purchaseId: bigint) => {
    if (!walletAddress) return setError("Connect wallet first");
    setError(null);
    setTxStatus("Awaiting signature...");
    try {
      await confirmDelivery(walletAddress, purchaseId);
      setTxStatus("Delivery confirmed! Payment released to seller.");
      loadMyPurchases();
      loadMyCredits();
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    }
  }, [walletAddress, loadMyPurchases, loadMyCredits]);

  const handleCancelPurchase = useCallback(async (purchaseId: bigint) => {
    if (!walletAddress) return setError("Connect wallet first");
    setError(null);
    setTxStatus("Awaiting signature...");
    try {
      await cancelPurchase(walletAddress, purchaseId);
      setTxStatus("Purchase cancelled. Credits refunded to listing.");
      loadMyPurchases();
      loadListings();
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    }
  }, [walletAddress, loadMyPurchases, loadListings]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "browse", label: "Browse", icon: <SearchIcon />, color: "#34d399" },
    { key: "list", label: "List Credits", icon: <PlusIcon />, color: "#7c6cf0" },
    { key: "my-credits", label: "My Credits", icon: <WalletIcon />, color: "#4fc3f7" },
    { key: "purchases", label: "Purchases", icon: <HistoryIcon />, color: "#fbbf24" },
  ];

  const getStatusConfig = (status: Record<string, unknown>) => {
    const key = Object.keys(status || {})[0] || "Active";
    return LISTING_STATUS_CONFIG[key] || LISTING_STATUS_CONFIG.Active;
  };

  const getPurchaseStatusConfig = (status: Record<string, unknown>) => {
    const key = Object.keys(status || {})[0] || "Pending";
    return PURCHASE_STATUS_CONFIG[key] || PURCHASE_STATUS_CONFIG.Pending;
  };

  return (
    <div className="w-full max-w-2xl animate-fade-in-up-delayed">
      {/* Toasts */}
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#f87171]/15 bg-[#f87171]/[0.05] px-4 py-3 backdrop-blur-sm animate-slide-down">
          <span className="mt-0.5 text-[#f87171]"><AlertIcon /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#f87171]/90">Error</p>
            <p className="text-xs text-[#f87171]/50 mt-0.5 break-all">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="shrink-0 text-[#f87171]/30 hover:text-[#f87171]/70 text-lg leading-none">&times;</button>
        </div>
      )}

      {txStatus && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#34d399]/15 bg-[#34d399]/[0.05] px-4 py-3 backdrop-blur-sm shadow-[0_0_30px_rgba(52,211,153,0.05)] animate-slide-down">
          <span className="text-[#34d399]">
            {txStatus.includes("confirmed") || txStatus.includes("created") || txStatus.includes("delivered") || txStatus.includes("Delivery confirmed") ? <CheckIcon /> : <SpinnerIcon />}
          </span>
          <span className="text-sm text-[#34d399]/90">{txStatus}</span>
        </div>
      )}

      {/* Main Card */}
      <Spotlight className="rounded-2xl">
        <AnimatedCard className="p-0" containerClassName="rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#34d399]/20 to-[#4fc3f7]/20 border border-white/[0.06]">
                <LeafIcon />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white/90">Carbon Credit Marketplace</h3>
                <p className="text-[10px] text-white/25 font-mono mt-0.5">{truncate(CONTRACT_ADDRESS)}</p>
              </div>
            </div>
            <Badge variant="success" className="text-[10px]">Permissionless</Badge>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setError(null); }}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-3.5 text-sm font-medium transition-all whitespace-nowrap",
                  activeTab === t.key ? "text-white/90" : "text-white/35 hover:text-white/55"
                )}
              >
                <span style={activeTab === t.key ? { color: t.color } : undefined}>{t.icon}</span>
                {t.label}
                {activeTab === t.key && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full transition-all"
                    style={{ background: `linear-gradient(to right, ${t.color}, ${t.color}66)` }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Browse Listings */}
            {activeTab === "browse" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-white/40">Available carbon credit listings</p>
                  <button onClick={loadListings} className="text-xs text-[#34d399]/60 hover:text-[#34d399] flex items-center gap-1">
                    <RefreshIcon /> Refresh
                  </button>
                </div>

                {isLoadingListings ? (
                  <div className="flex items-center justify-center py-8">
                    <SpinnerIcon />
                  </div>
                ) : listings.length === 0 ? (
                  <div className="text-center py-8 text-white/30 text-sm">
                    No active listings. Be the first to list credits!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {listings.map((listing, idx) => {
                      const status = getStatusConfig(listing.status);
                      const isMyListing = walletAddress && listing.seller === walletAddress;
                      return (
                        <div key={idx} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-white/90 text-sm">{String(listing.project_name)}</h4>
                            <span className={cn("text-[10px] px-2 py-1 rounded-full", status.bg, status.color)}>
                              {status.label}
                            </span>
                          </div>
                          <p className="text-xs text-white/40 line-clamp-2">{String(listing.project_description)}</p>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-white/30">Available:</span>
                            <span className="font-mono text-white/70">{formatAmount(listing.remaining_amount)} tons</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-white/30">Price:</span>
                            <span className="font-mono text-[#34d399]">{formatAmount(listing.price_per_unit)} XLM/ton</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-white/30">Seller:</span>
                            <span className="font-mono text-white/50">{truncate(listing.seller)}</span>
                          </div>
                          
                          {!isMyListing && walletAddress && (
                            <div className="pt-2 border-t border-white/[0.06] flex gap-2">
                              <input
                                type="number"
                                placeholder="Amount (tons)"
                                value={buyAmount[String(idx)] || ""}
                                onChange={(e) => setBuyAmount(prev => ({ ...prev, [String(idx)]: e.target.value }))}
                                className="flex-1 rounded-lg bg-white/[0.02] border border-white/[0.06] px-3 py-2 text-xs font-mono text-white/70 outline-none focus:border-[#34d399]/30"
                              />
                              <ShimmerButton 
                                onClick={() => handleBuyCredits(String(idx))} 
                                shimmerColor="#34d399" 
                                className="text-xs px-4"
                              >
                                Buy
                              </ShimmerButton>
                            </div>
                          )}
                          
                          {isMyListing && (
                            <div className="pt-2 text-xs text-[#fbbf24]/60 italic">
                              This is your listing
                            </div>
                          )}
                          
                          {!walletAddress && (
                            <button
                              onClick={onConnect}
                              className="pt-2 w-full text-xs text-[#34d399]/60 hover:text-[#34d399]"
                            >
                              Connect wallet to buy
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Create Listing */}
            {activeTab === "list" && (
              <div className="space-y-5">
                <p className="text-xs text-white/40">List your carbon credits for sale. Anyone can create a listing.</p>
                
                <Input 
                  label="Project Name" 
                  value={projectName} 
                  onChange={(e) => setProjectName(e.target.value)} 
                  placeholder="e.g. Amazon Rainforest Protection"
                />
                
                <Input 
                  label="Description" 
                  value={projectDesc} 
                  onChange={(e) => setProjectDesc(e.target.value)} 
                  placeholder="Describe your carbon offset project..."
                />
                
                <Input 
                  label="Amount to List" 
                  value={listAmount} 
                  onChange={(e) => setListAmount(e.target.value)} 
                  placeholder="100" 
                  suffix="tons CO2"
                />
                
                <Input 
                  label="Price per Ton" 
                  value={listPrice} 
                  onChange={(e) => setListPrice(e.target.value)} 
                  placeholder="50" 
                  suffix="XLM"
                />

                {walletAddress ? (
                  <ShimmerButton onClick={handleCreateListing} disabled={isCreating} shimmerColor="#7c6cf0" className="w-full">
                    {isCreating ? <><SpinnerIcon /> Creating...</> : <><PlusIcon /> Create Listing</>}
                  </ShimmerButton>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#7c6cf0]/20 bg-[#7c6cf0]/[0.03] py-4 text-sm text-[#7c6cf0]/60 hover:border-[#7c6cf0]/30 hover:text-[#7c6cf0]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to list credits
                  </button>
                )}
              </div>
            )}

            {/* My Credits */}
            {activeTab === "my-credits" && (
              <div className="space-y-5">
                <div className="text-center py-8">
                  <div className="flex items-center justify-center mb-4">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[#4fc3f7]/20 to-[#34d399]/20 flex items-center justify-center">
                      <LeafIcon />
                    </div>
                  </div>
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Your Balance</p>
                  {isLoadingCredits ? (
                    <div className="flex items-center justify-center">
                      <SpinnerIcon />
                    </div>
                  ) : (
                    <p className="text-3xl font-mono text-white/90">{formatAmount(myCredits)}</p>
                  )}
                  <p className="text-sm text-white/30 mt-1">tons of CO2 credits</p>
                </div>

                {walletAddress ? (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-[10px] text-white/25 uppercase tracking-wider mb-2">Wallet</p>
                    <p className="font-mono text-sm text-white/70">{truncate(walletAddress)}</p>
                  </div>
                ) : (
                  <button
                    onClick={onConnect}
                    className="w-full rounded-xl border border-dashed border-[#4fc3f7]/20 bg-[#4fc3f7]/[0.03] py-4 text-sm text-[#4fc3f7]/60 hover:border-[#4fc3f7]/30 hover:text-[#4fc3f7]/80 active:scale-[0.99] transition-all"
                  >
                    Connect wallet to view credits
                  </button>
                )}
              </div>
            )}

            {/* My Purchases */}
            {activeTab === "purchases" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-white/40">Your purchase history</p>
                  <button onClick={loadMyPurchases} className="text-xs text-[#fbbf24]/60 hover:text-[#fbbf24] flex items-center gap-1">
                    <RefreshIcon /> Refresh
                  </button>
                </div>

                {!walletAddress ? (
                  <button
                    onClick={onConnect}
                    className="w-full rounded-xl border border-dashed border-[#fbbf24]/20 bg-[#fbbf24]/[0.03] py-4 text-sm text-[#fbbf24]/60 hover:border-[#fbbf24]/30 hover:text-[#fbbf24]/80 active:scale-[0.99] transition-all"
                  >
                    Connect wallet to view purchases
                  </button>
                ) : isLoadingPurchases ? (
                  <div className="flex items-center justify-center py-8">
                    <SpinnerIcon />
                  </div>
                ) : myPurchases.length === 0 ? (
                  <div className="text-center py-8 text-white/30 text-sm">
                    No purchases yet. Browse listings to buy credits!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {myPurchases.map((purchase, idx) => {
                      const status = getPurchaseStatusConfig(purchase.status);
                      const isBuyer = walletAddress === purchase.buyer;
                      const isSeller = walletAddress === purchase.seller;
                      
                      return (
                        <div key={idx} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/30">Purchase #{String(purchase.listing_id)}</span>
                            <span className={cn("text-[10px] px-2 py-1 rounded-full", status.bg, status.color)}>
                              {status.label}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-white/30">Amount:</span>
                            <span className="font-mono text-white/70">{formatAmount(purchase.amount)} tons</span>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-white/30">Total Price:</span>
                            <span className="font-mono text-[#34d399]">{formatAmount(purchase.total_price)} XLM</span>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-white/30">Role:</span>
                            <span className="font-mono text-white/70">
                              {isBuyer ? "Buyer" : isSeller ? "Seller" : "Unknown"}
                            </span>
                          </div>

                          {/* Action buttons based on status */}
                          <div className="pt-2 border-t border-white/[0.06] flex gap-2">
                            {isSeller && purchase.status.Pending && (
                              <ShimmerButton 
                                onClick={() => handleDeliverCredits(purchase.listing_id)} 
                                shimmerColor="#7c6cf0" 
                                className="flex-1 text-xs"
                              >
                                <LeafIcon /> Deliver Credits
                              </ShimmerButton>
                            )}
                            {isBuyer && purchase.status.Delivered && (
                              <ShimmerButton 
                                onClick={() => handleConfirmDelivery(purchase.listing_id)} 
                                shimmerColor="#34d399" 
                                className="flex-1 text-xs"
                              >
                                <CheckIcon /> Confirm Receipt
                              </ShimmerButton>
                            )}
                            {isBuyer && purchase.status.Pending && (
                              <ShimmerButton 
                                onClick={() => handleCancelPurchase(purchase.listing_id)} 
                                shimmerColor="#f87171" 
                                className="flex-1 text-xs"
                              >
                                Cancel
                              </ShimmerButton>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.04] px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-white/15">Carbon Credit Marketplace &middot; Soroban</p>
            <div className="flex items-center gap-2">
              {["List", "Buy", "Escrow", "Confirm"].map((s, i) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-[#34d399]" />
                  <span className="font-mono text-[9px] text-white/15">{s}</span>
                  {i < 3 && <span className="text-white/10 text-[8px]">&rarr;</span>}
                </span>
              ))}
            </div>
          </div>
        </AnimatedCard>
      </Spotlight>
    </div>
  );
}
